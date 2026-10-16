using Sgo.Domain.Common;

namespace Sgo.Application.Common;

public interface IFolioGenerator
{
    /// <summary>
    /// Returns the next folio for the document type (e.g. <c>OC-000001</c>).
    /// Backed by a Postgres sequence: numbers are unique but a rolled-back transaction leaves a gap.
    /// </summary>
    Task<string> NextAsync(DocType docType, CancellationToken ct = default);
}
