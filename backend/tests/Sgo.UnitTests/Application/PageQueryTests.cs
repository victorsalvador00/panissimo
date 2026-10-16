using Sgo.Application.Common;

namespace Sgo.UnitTests.Application;

public class PageQueryTests
{
    [Theory]
    [InlineData(500, 100)]
    [InlineData(0, 1)]
    [InlineData(25, 25)]
    public void PageSize_is_clamped_to_1_100(int requested, int expected) =>
        Assert.Equal(expected, new PageQuery { PageSize = requested }.PageSize);

    [Fact]
    public void Skip_is_computed_from_page() =>
        Assert.Equal(50, new PageQuery { Page = 3, PageSize = 25 }.Skip);
}
