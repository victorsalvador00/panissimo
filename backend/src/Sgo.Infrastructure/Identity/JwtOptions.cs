using System.ComponentModel.DataAnnotations;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace Sgo.Infrastructure.Identity;

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
                $"Jwt:Key must be at least {MinKeyBytes} bytes. Set SGO__Jwt__Key.", [nameof(Key)]);
    }
}
