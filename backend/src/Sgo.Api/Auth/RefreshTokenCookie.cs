namespace Sgo.Api.Auth;

/// <summary>Refresh token cookie: HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth (backend spec §7).</summary>
public static class RefreshTokenCookie
{
    public const string Name = "sgo_refresh";
    public const string Path = "/" + ApiRoutePrefixConvention.Prefix + "/auth";

    public static string? Read(HttpRequest request) => request.Cookies[Name];

    public static void Write(HttpResponse response, string token, DateTimeOffset expiresAt) =>
        response.Cookies.Append(Name, token, Options(expiresAt));

    public static void Delete(HttpResponse response) =>
        response.Cookies.Delete(Name, Options(null));

    private static CookieOptions Options(DateTimeOffset? expiresAt) => new()
    {
        HttpOnly = true,
        Secure = true,
        SameSite = SameSiteMode.Strict,
        Path = Path,
        Expires = expiresAt,
        IsEssential = true,
    };
}
