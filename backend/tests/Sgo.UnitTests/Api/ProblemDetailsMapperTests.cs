using Sgo.Api.Middleware;
using Sgo.Domain.Common;

namespace Sgo.UnitTests.Api;

public class ProblemDetailsMapperTests
{
    [Fact]
    public void BusinessRule_maps_to_422_with_rule_code()
    {
        var problem = ProblemDetailsMapper.Map(new BusinessRuleException("po_not_approved", "La OC no está aprobada."));

        Assert.Equal(422, problem.Status);
        Assert.Equal("https://sgo/errors/po_not_approved", problem.Type);
        Assert.Equal("po_not_approved", problem.Extensions["code"]);
        Assert.Equal("La OC no está aprobada.", problem.Detail);
    }

    [Fact]
    public void InsufficientStock_maps_to_409_with_shortages()
    {
        var shortage = new StockShortage(Guid.NewGuid(), "HAR-001", "Harina", null, 10m, 4m);

        var problem = ProblemDetailsMapper.Map(new InsufficientStockException([shortage]));

        Assert.Equal(409, problem.Status);
        Assert.Equal("insufficient_stock", problem.Extensions["code"]);
        var shortages = Assert.IsAssignableFrom<IReadOnlyList<StockShortage>>(problem.Extensions["shortages"]);
        Assert.Equal(shortage, Assert.Single(shortages));
    }

    [Theory]
    [InlineData(typeof(ConcurrencyException), 409, "concurrency")]
    [InlineData(typeof(ForbiddenException), 403, "forbidden")]
    public void Known_exceptions_map_to_expected_status(Type exceptionType, int status, string code)
    {
        var exception = (Exception)Activator.CreateInstance(exceptionType, exceptionType == typeof(ForbiddenException)
            ? ["Sin acceso."]
            : [])!;

        var problem = ProblemDetailsMapper.Map(exception);

        Assert.Equal(status, problem.Status);
        Assert.Equal(code, problem.Extensions["code"]);
    }

    [Fact]
    public void EF_concurrency_conflict_maps_to_409_concurrency()
    {
        var problem = ProblemDetailsMapper.Map(new Microsoft.EntityFrameworkCore.DbUpdateConcurrencyException("xmin mismatch"));

        Assert.Equal(409, problem.Status);
        Assert.Equal("concurrency", problem.Extensions["code"]);
        Assert.DoesNotContain("xmin", problem.Detail);
    }

    [Fact]
    public void Unique_violation_maps_to_409_duplicate_without_database_details()
    {
        var inner = new Npgsql.PostgresException(
            "duplicate key value violates unique constraint \"ix_lots_item_id_lot_number\"", "ERROR", "ERROR", "23505");

        var problem = ProblemDetailsMapper.Map(new Microsoft.EntityFrameworkCore.DbUpdateException("save failed", inner));

        Assert.Equal(409, problem.Status);
        Assert.Equal("duplicate", problem.Extensions["code"]);
        Assert.Equal("Otro usuario registró la misma información al mismo tiempo. Vuelve a intentarlo.", problem.Detail);
    }

    [Fact]
    public void Other_database_errors_stay_500()
    {
        var inner = new Npgsql.PostgresException("violates foreign key constraint", "ERROR", "ERROR", "23503");

        var problem = ProblemDetailsMapper.Map(new Microsoft.EntityFrameworkCore.DbUpdateException("save failed", inner));

        Assert.Equal(500, problem.Status);
    }

    [Fact]
    public void NotFound_maps_to_404()
    {
        var problem = ProblemDetailsMapper.Map(new NotFoundException("Artículo", Guid.Empty));

        Assert.Equal(404, problem.Status);
    }

    [Fact]
    public void Normalize_rewrites_framework_problem_to_sgo_type_in_spanish()
    {
        var problem = new Microsoft.AspNetCore.Mvc.ProblemDetails
        {
            Status = 401,
            Type = "https://tools.ietf.org/html/rfc9110#section-15.5.2",
            Title = "Unauthorized",
        };

        ProblemDetailsMapper.Normalize(problem);

        Assert.Equal("https://sgo/errors/unauthorized", problem.Type);
        Assert.Equal("No autenticado", problem.Title);
        Assert.Equal("unauthorized", problem.Extensions["code"]);
    }

    [Fact]
    public void Normalize_keeps_problems_already_mapped()
    {
        var problem = ProblemDetailsMapper.Map(new BusinessRuleException("po_not_approved", "x"));

        ProblemDetailsMapper.Normalize(problem);

        Assert.Equal("https://sgo/errors/po_not_approved", problem.Type);
    }

    [Fact]
    public void Unhandled_exception_maps_to_500_without_internal_details()
    {
        var problem = ProblemDetailsMapper.Map(new InvalidOperationException("connection string leaked"));

        Assert.Equal(500, problem.Status);
        Assert.DoesNotContain("connection string", problem.Detail);
    }
}
