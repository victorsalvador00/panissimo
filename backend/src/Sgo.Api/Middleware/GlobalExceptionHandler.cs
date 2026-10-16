using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Sgo.Domain.Common;

namespace Sgo.Api.Middleware;

public sealed class GlobalExceptionHandler(
    IProblemDetailsService problemDetailsService,
    ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is DomainException or DbUpdateConcurrencyException)
            logger.LogInformation("Domain error {ExceptionType}: {Message}", exception.GetType().Name, exception.Message);
        else if (ProblemDetailsMapper.IsUniqueViolation(exception))
            logger.LogWarning(exception, "Concurrent duplicate write");
        else
            logger.LogError(exception, "Unhandled exception");

        var problem = ProblemDetailsMapper.Map(exception);
        httpContext.Response.StatusCode = problem.Status!.Value;

        return await problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = problem,
            Exception = exception,
        });
    }
}
