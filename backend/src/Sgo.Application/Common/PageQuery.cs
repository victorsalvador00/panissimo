namespace Sgo.Application.Common;

public record PageQuery
{
    public const int MaxPageSize = 100;

    private readonly int _page = 1;
    private readonly int _pageSize = 25;

    public int Page { get => _page; init => _page = value < 1 ? 1 : value; }
    public int PageSize { get => _pageSize; init => _pageSize = Math.Clamp(value, 1, MaxPageSize); }
    public string? Sort { get; init; }
    public string? Q { get; init; }

    public int Skip => (Page - 1) * PageSize;
}
