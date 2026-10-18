using Npgsql;
using Panissimo.Infrastructure;

namespace Panissimo.UnitTests.Infrastructure;

public class ConnectionStringTests
{
    [Fact]
    public void Kerberos_is_disabled_unless_the_connection_string_chooses()
    {
        var plain = new NpgsqlConnectionStringBuilder(DependencyInjection.WithoutKerberos("Host=db;Database=x;Username=u;SSL Mode=Require"));
        Assert.Equal((GssEncryptionMode.Disable, SslMode.Require, "db"), (plain.GssEncryptionMode, plain.SslMode, plain.Host));

        var chosen = new NpgsqlConnectionStringBuilder(DependencyInjection.WithoutKerberos("Host=db;GSS Encryption Mode=Require"));
        Assert.Equal(GssEncryptionMode.Require, chosen.GssEncryptionMode);
    }
}
