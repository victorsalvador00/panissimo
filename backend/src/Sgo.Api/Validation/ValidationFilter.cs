using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Sgo.Api.Middleware;

namespace Sgo.Api.Validation;

/// <summary>Runs the FluentValidation validator of every action argument before the controller (backend spec §8).</summary>
public sealed class ValidationFilter(IServiceProvider services) : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var errors = new Dictionary<string, string[]>();

        foreach (var argument in context.ActionArguments.Values.Where(a => a is not null))
        {
            var validatorType = typeof(IValidator<>).MakeGenericType(argument!.GetType());
            if (services.GetService(validatorType) is not IValidator validator)
                continue;

            var result = await validator.ValidateAsync(new ValidationContext<object>(argument), context.HttpContext.RequestAborted);
            foreach (var group in result.Errors.GroupBy(e => ValidationKeys.ToCamelCase(e.PropertyName)))
                errors[group.Key] = group.Select(e => e.ErrorMessage).ToArray();
        }

        if (errors.Count > 0)
        {
            var problem = new ValidationProblemDetails(errors)
            {
                Status = StatusCodes.Status400BadRequest,
                Detail = "La solicitud contiene datos inválidos.",
            };
            ProblemDetailsMapper.Normalize(problem);
            context.Result = new ObjectResult(problem) { StatusCode = StatusCodes.Status400BadRequest };
            return;
        }

        await next();
    }
}
