using Microsoft.EntityFrameworkCore;
using Sgo.Application.Common;
using Sgo.Domain.Common;

namespace Sgo.Infrastructure.Persistence;

public sealed class FolioGenerator(SgoDbContext db) : IFolioGenerator
{
    public async Task<string> NextAsync(DocType docType, CancellationToken ct = default)
    {
        var definition = Folio.Definitions[docType];
        // Schema and sequence names come from a fixed internal table, never from user input.
        var sql = $"SELECT nextval('\"{definition.Schema}\".\"{definition.SequenceName}\"') AS \"Value\"";
        var number = await db.Database.SqlQueryRaw<long>(sql).SingleAsync(ct);
        return Folio.Format(docType, number);
    }
}
