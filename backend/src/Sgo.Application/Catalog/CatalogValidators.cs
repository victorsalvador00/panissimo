using FluentValidation;
using Sgo.Domain.Catalog;

namespace Sgo.Application.Catalog;

public sealed class CreateUnitOfMeasureRequestValidator : AbstractValidator<CreateUnitOfMeasureRequest>
{
    public CreateUnitOfMeasureRequestValidator()
    {
        RuleFor(x => x.Code).NotEmpty().MaximumLength(20).Matches("^[A-Za-z0-9._-]+$")
            .WithMessage("El código solo admite letras, números, punto, guion y guion bajo.").WithName("Código");
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100).WithName("Nombre");
        RuleFor(x => x.Kind).IsInEnum().WithName("Tipo");
    }
}

public sealed class UpdateUnitOfMeasureRequestValidator : AbstractValidator<UpdateUnitOfMeasureRequest>
{
    public UpdateUnitOfMeasureRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100).WithName("Nombre");
        RuleFor(x => x.Kind).IsInEnum().WithName("Tipo");
    }
}

public sealed class CreateItemCategoryRequestValidator : AbstractValidator<CreateItemCategoryRequest>
{
    public CreateItemCategoryRequestValidator() => RuleFor(x => x.Name).NotEmpty().MaximumLength(100).WithName("Nombre");
}

public sealed class UpdateItemCategoryRequestValidator : AbstractValidator<UpdateItemCategoryRequest>
{
    public UpdateItemCategoryRequestValidator() => RuleFor(x => x.Name).NotEmpty().MaximumLength(100).WithName("Nombre");
}

/// <summary>Field rules come from <see cref="ItemRules"/> so the API and the CSV import agree.</summary>
public sealed class CreateItemRequestValidator : AbstractValidator<CreateItemRequest>
{
    public CreateItemRequestValidator() => RuleFor(x => x).Custom((request, context) =>
    {
        foreach (var (field, message) in ItemRules.Check(request.ToDefinition()))
            context.AddFailure(field, message);
    });
}

public sealed class UpdateItemRequestValidator : AbstractValidator<UpdateItemRequest>
{
    public UpdateItemRequestValidator() => RuleFor(x => x).Custom((request, context) =>
    {
        foreach (var (field, message) in ItemRules.Check(request.ToDefinition()))
            context.AddFailure(field, message);
    });
}

public sealed class UpdateItemLocationSettingsRequestValidator : AbstractValidator<UpdateItemLocationSettingsRequest>
{
    public UpdateItemLocationSettingsRequestValidator()
    {
        RuleFor(x => x.Settings).Cascade(CascadeMode.Stop).NotNull().WithMessage("Indica la configuración por ubicación.")
            .Must(s => s.Select(x => x.LocationId).Distinct().Count() == s.Count).WithMessage("Hay ubicaciones repetidas.");
        RuleForEach(x => x.Settings).ChildRules(setting =>
        {
            setting.RuleFor(s => s.MinQty).Must((s, min) => (min is null) == (s.MaxQty is null))
                .WithMessage("Captura mínimo y máximo, o deja ambos vacíos para quitar la configuración.");
            setting.RuleFor(s => s.MinQty).GreaterThanOrEqualTo(0).When(s => s.MinQty is not null).WithName("Mínimo");
            setting.RuleFor(s => s.MaxQty).GreaterThanOrEqualTo(s => s.MinQty!.Value)
                .When(s => s.MinQty is not null && s.MaxQty is not null)
                .WithMessage("El máximo debe ser mayor o igual que el mínimo.");
            setting.RuleFor(s => s.MinQty).Must(q => q is null || decimal.Round(q.Value, 4) == q)
                .WithMessage("Máximo 4 decimales.");
            setting.RuleFor(s => s.MaxQty).Must(q => q is null || decimal.Round(q.Value, 4) == q)
                .WithMessage("Máximo 4 decimales.");
        });
    }
}
