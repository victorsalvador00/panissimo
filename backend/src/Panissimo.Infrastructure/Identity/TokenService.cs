using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Panissimo.Application.Common;
using Panissimo.Application.Security;

namespace Panissimo.Infrastructure.Identity;

public sealed class JwtOptions : IValidatableObject
{
    public const string Section = "Jwt";
    public const int MinKeyBytes = 32;

    [Required] public string Key { get; set; } = "";
    [Required] public string Issuer { get; set; } = "";
    [Required] public string Audience { get; set; } = "";
    [Range(1, 60)] public int AccessTokenMinutes { get; set; } = 15;
    [Range(1, 30)] public int RefreshTokenDays { get; set; } = 7;

    public SymmetricSecurityKey SigningKey => new(Encoding.UTF8.GetBytes(Key));

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (Encoding.UTF8.GetByteCount(Key) < MinKeyBytes)
            yield return new ValidationResult(
                $"Jwt:Key must be at least {MinKeyBytes} bytes. Set PAN__Jwt__Key.", [nameof(Key)]);
    }
}

public sealed class TokenService(IOptions<JwtOptions> options, IClock clock)
{
    private readonly JwtOptions _options = options.Value;
    private readonly JsonWebTokenHandler _handler = new();

    /// <summary>HS256 access token. Permissions are not embedded; they are resolved per request (backend §9).</summary>
    public TokenResponse CreateAccessToken(AppUser user)
    {
        var now = clock.UtcNow;
        var lifetime = TimeSpan.FromMinutes(_options.AccessTokenMinutes);
        var token = _handler.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = _options.Issuer,
            Audience = _options.Audience,
            IssuedAt = now.UtcDateTime,
            NotBefore = now.UtcDateTime,
            Expires = (now + lifetime).UtcDateTime,
            SigningCredentials = new SigningCredentials(_options.SigningKey, SecurityAlgorithms.HmacSha256),
            Subject = new ClaimsIdentity(
            [
                new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                new Claim(JwtRegisteredClaimNames.Email, user.Email ?? ""),
                new Claim(JwtRegisteredClaimNames.Name, user.FullName),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            ]),
        });
        return new TokenResponse(token, (int)lifetime.TotalSeconds);
    }

    /// <summary>A new opaque refresh token (256 random bits) and the hash to store.</summary>
    public (string Token, string Hash, DateTimeOffset ExpiresAt) CreateRefreshToken()
    {
        var token = Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));
        return (token, Hash(token), clock.UtcNow.AddDays(_options.RefreshTokenDays));
    }

    public static string Hash(string token) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
