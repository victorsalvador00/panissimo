using Microsoft.Extensions.DependencyInjection;
using Sgo.Application.Common;
using Sgo.Domain.Common;

namespace Sgo.IntegrationTests.Persistence;

[Collection(ApiCollection.Name)]
public class FolioGeneratorTests(SgoApiFactory factory)
{
    [Fact]
    public async Task Concurrent_requests_get_unique_consecutive_folios()
    {
        const int count = 50;

        var folios = await Task.WhenAll(Enumerable.Range(0, count).Select(async _ =>
        {
            await using var scope = factory.CreateScope();
            return await scope.ServiceProvider.GetRequiredService<IFolioGenerator>().NextAsync(DocType.Adjustment);
        }));

        Assert.All(folios, f => Assert.Matches(@"^AJ-\d{6}$", f));
        var numbers = folios.Select(f => int.Parse(f[3..])).Order().ToList();
        Assert.Equal(count, numbers.Distinct().Count());
        Assert.Equal(Enumerable.Range(numbers[0], count), numbers);
    }

    [Fact]
    public async Task Each_document_type_has_its_own_sequence()
    {
        await using var scope = factory.CreateScope();
        var generator = scope.ServiceProvider.GetRequiredService<IFolioGenerator>();

        foreach (var docType in Enum.GetValues<DocType>())
            Assert.StartsWith(Folio.Definitions[docType].Prefix + "-", await generator.NextAsync(docType));
    }
}
