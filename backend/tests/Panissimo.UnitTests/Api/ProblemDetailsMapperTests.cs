using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Panissimo.Api.Middleware;
using Panissimo.Api.Validation;
using Panissimo.Domain.Common;

namespace Panissimo.UnitTests.Api;

public class ProblemDetailsMapperTests
{
    [Fact]
    public void Business_rule_maps_to_422_with_its_code()
    {
        var problem = ProblemDetailsMapper.Map(new BusinessRuleException("production_overrun", "Supera la tolerancia."));

        Assert.Equal(StatusCodes.Status422UnprocessableEntity, problem.Status);
        Assert.Equal("https://panissimo/errors/production_overrun", problem.Type);
        Assert.Equal("production_overrun", problem.Extensions["code"]);
        Assert.Equal("Supera la tolerancia.", problem.Detail);
    }

    [Fact]
    public void Insufficient_stock_maps_to_409_with_shortages()
    {
        var shortage = new StockShortage(Guid.NewGuid(), "HAR-001", "Harina", null, null, 10, 4);

        var problem = ProblemDetailsMapper.Map(new InsufficientStockException([shortage]));

        Assert.Equal(StatusCodes.Status409Conflict, problem.Status);
        Assert.Equal("insufficient_stock", problem.Extensions["code"]);
        var shortages = Assert.IsType<IReadOnlyList<StockShortage>>(problem.Extensions["shortages"], exactMatch: false);
        Assert.Equal(shortage, Assert.Single(shortages));
    }

    public static TheoryData<Exception, int, string> SimpleExceptions => new()
    {
        { new ConcurrencyException(), StatusCodes.Status409Conflict, "concurrency" },
        { new ForbiddenException(), StatusCodes.Status403Forbidden, "forbidden" },
        { new AuthenticationFailedException("invalid_credentials", "Credenciales inválidas."), StatusCodes.Status401Unauthorized, "invalid_credentials" },
        { new InvalidOperationException("boom"), StatusCodes.Status500InternalServerError, "internal" },
    };

    [Theory]
    [MemberData(nameof(SimpleExceptions))]
    public void Maps_exception_types(Exception exception, int status, string code)
    {
        var problem = ProblemDetailsMapper.Map(exception);

        Assert.Equal(status, problem.Status);
        Assert.Equal(code, problem.Extensions["code"]);
    }

    [Fact]
    public void Not_found_maps_to_404()
    {
        var problem = ProblemDetailsMapper.Map(new NotFoundException("el artículo", "X"));

        Assert.Equal(StatusCodes.Status404NotFound, problem.Status);
        Assert.Equal("No se encontró el artículo con identificador 'X'.", problem.Detail);
    }

    [Fact]
    public void Normalize_gives_framework_problems_a_spanish_title_and_code()
    {
        var problem = new ProblemDetails { Status = StatusCodes.Status404NotFound, Title = "Not Found" };

        ProblemDetailsMapper.Normalize(problem);

        Assert.Equal("https://panissimo/errors/not_found", problem.Type);
        Assert.Equal("No encontrado", problem.Title);
        Assert.Equal("not_found", problem.Extensions["code"]);
    }

    [Theory]
    [InlineData("Lines[0].Quantity", "lines[0].quantity")]
    [InlineData("Email", "email")]
    public void Validation_keys_are_camel_case(string input, string expected) =>
        Assert.Equal(expected, ValidationKeys.ToCamelCase(input));
}
