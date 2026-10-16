using Sgo.Application.Organization;
using Sgo.Domain.Organization;

namespace Sgo.UnitTests.Application;

public class SettingsValidatorsTests
{
    private static bool IsValid(string key, decimal value) =>
        new UpdateSettingsRequestValidator().Validate(new UpdateSettingsRequest([new SettingValueRequest(key, value, 1)])).IsValid;

    [Theory]
    [InlineData(AppSettingKeys.PoApprovalThreshold, 0, true)]
    [InlineData(AppSettingKeys.PoApprovalThreshold, 15000.50, true)]
    [InlineData(AppSettingKeys.PoApprovalThreshold, 15000.505, false)] // cents only
    [InlineData(AppSettingKeys.PoApprovalThreshold, -1, false)]
    [InlineData(AppSettingKeys.ReceiptTolerancePct, 100, true)]
    [InlineData(AppSettingKeys.ReceiptTolerancePct, 100.01, false)]
    [InlineData(AppSettingKeys.ExpirationAlertDays, 3, true)]
    [InlineData(AppSettingKeys.ExpirationAlertDays, 2.5, false)] // whole days
    [InlineData(AppSettingKeys.ExpirationAlertDays, 366, false)]
    public void Each_setting_has_its_own_limits(string key, decimal value, bool valid) => Assert.Equal(valid, IsValid(key, value));

    [Fact]
    public void Unknown_or_repeated_settings_are_rejected()
    {
        Assert.False(IsValid("no.existe", 1));
        var repeated = new UpdateSettingsRequest([
            new SettingValueRequest(AppSettingKeys.ExpirationAlertDays, 3, 1), new SettingValueRequest(AppSettingKeys.ExpirationAlertDays, 4, 1)]);
        Assert.Contains("Hay parámetros repetidos.", new UpdateSettingsRequestValidator().Validate(repeated).Errors.Select(e => e.ErrorMessage));
    }

    [Fact]
    public void Every_default_setting_has_a_valid_definition()
    {
        foreach (var setting in AppSettingKeys.Defaults)
        {
            var definition = SettingDefinitions.Find(setting.Key);
            Assert.NotNull(definition);
            Assert.Null(definition.Validate(decimal.Parse(setting.Value, System.Globalization.CultureInfo.InvariantCulture)));
        }
    }
}
