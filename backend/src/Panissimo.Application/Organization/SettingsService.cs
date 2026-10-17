using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Domain.Common;
using Panissimo.Domain.Organization;

namespace Panissimo.Application.Organization;

/// <param name="Decimals">0 for whole numbers.</param>
public sealed record AppSettingDto(
    string Key, string Label, SettingKind Kind, decimal Value, decimal Min, decimal Max, int Decimals,
    DateTimeOffset? UpdatedAt, Guid? UpdatedBy, string? UpdatedByName, uint Version);

public sealed record SettingValueRequest(string Key, decimal Value, uint Version);

/// <summary>Only the settings listed change; each one checks its own version.</summary>
public sealed record UpdateSettingsRequest(IReadOnlyList<SettingValueRequest> Settings);

public sealed class UpdateSettingsRequestValidator : AbstractValidator<UpdateSettingsRequest>
{
    public UpdateSettingsRequestValidator()
    {
        RuleFor(x => x.Settings).Cascade(CascadeMode.Stop)
            .NotEmpty().WithMessage("Indica al menos un parámetro.")
            .Must(s => s.Select(x => x.Key).Distinct().Count() == s.Count).WithMessage("Hay parámetros repetidos.");
        RuleForEach(x => x.Settings).Custom((setting, context) =>
        {
            var definition = SettingDefinitions.Find(setting.Key);
            if (definition is null)
                context.AddFailure("key", $"El parámetro '{setting.Key}' no existe.");
            else if (definition.Validate(setting.Value) is { } error)
                context.AddFailure("value", error);
        });
    }
}

public interface ISettingsService
{
    Task<IReadOnlyList<AppSettingDto>> GetAsync(CancellationToken ct = default);
    Task<IReadOnlyList<AppSettingDto>> UpdateAsync(UpdateSettingsRequest request, CancellationToken ct = default);
}

public sealed class SettingsService(IAppDbContext db, IClock clock, ICurrentUser currentUser, IUserDirectory userDirectory) : ISettingsService
{
    public async Task<IReadOnlyList<AppSettingDto>> GetAsync(CancellationToken ct = default)
    {
        var stored = await db.AppSettings.AsNoTracking().ToDictionaryAsync(s => s.Key, ct);
        var users = await userDirectory.GetNamesAsync(stored.Values.Select(s => s.UpdatedBy), ct);
        return SettingDefinitions.All.Select(d => ToDto(d, stored.GetValueOrDefault(d.Key), users)).ToList();
    }

    public async Task<IReadOnlyList<AppSettingDto>> UpdateAsync(UpdateSettingsRequest request, CancellationToken ct = default)
    {
        var keys = request.Settings.Select(s => s.Key).ToList();
        var stored = await db.AppSettings.Where(s => keys.Contains(s.Key)).ToDictionaryAsync(s => s.Key, ct);
        foreach (var change in request.Settings)
        {
            // The seed creates every setting; a missing row means the database was not initialized.
            var setting = stored.GetValueOrDefault(change.Key) ?? throw new NotFoundException("el parámetro", change.Key);
            db.EnsureVersion(setting, change.Version);
            if (setting.DecimalValue == change.Value)
                continue;
            setting.SetValue(change.Value);
            setting.UpdatedAt = clock.UtcNow;
            setting.UpdatedBy = currentUser.UserId;
        }
        await db.SaveChangesAsync(ct);
        return await GetAsync(ct);
    }

    private static AppSettingDto ToDto(SettingDefinition d, AppSetting? s, UserNames users) =>
        new(d.Key, d.Label, d.Kind, s?.DecimalValue ?? d.Default, d.Min, d.Max, d.Decimals,
            s?.UpdatedAt, s?.UpdatedBy, users.Of(s?.UpdatedBy), s?.Version ?? 0);
}
