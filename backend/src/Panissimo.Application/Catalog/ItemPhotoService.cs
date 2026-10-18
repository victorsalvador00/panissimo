using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;

namespace Panissimo.Application.Catalog;

public enum ItemPhotoSize
{
    Thumbnail,
    Full,
}

/// <summary>A file of the upload: its bytes and the content type the browser declared (the real one is read from the bytes).</summary>
public sealed record PhotoUpload(byte[] Content, string? DeclaredContentType);

public sealed record ItemPhotoDto(Guid ItemId, long Revision, string ImageContentType, int ImageBytes, string ThumbnailContentType,
    int ThumbnailBytes, DateTimeOffset UpdatedAt);

public sealed record ItemPhotoContent(byte[] Content, string ContentType, long Revision);

public static class ItemPhotoRules
{
    /// <summary>
    /// Checks one file of the upload (dominio §3, ItemPhoto): a PNG, JPEG or WebP image no larger than
    /// <paramref name="maxSide"/> px on either side nor <paramref name="maxBytes"/>. Returns the error message or null.
    /// </summary>
    public static string? Validate(byte[]? content, int maxSide, int maxBytes, out ImageInfo? info)
    {
        info = null;
        if (content is null || content.Length == 0)
            return "Falta la imagen.";
        if (content.Length > maxBytes)
            return $"La imagen pesa {content.Length / 1024.0:0.#} KB; el máximo es {maxBytes / 1024} KB.";
        info = ImageHeader.Read(content);
        if (info is null)
            return "El archivo no es una imagen PNG, JPEG o WebP.";
        if (info.Width > maxSide || info.Height > maxSide)
            return $"La imagen mide {info.Width}×{info.Height} px; el máximo es {maxSide} px por lado.";
        return null;
    }
}

public interface IItemPhotoService
{
    /// <summary>Null when the item has no photo.</summary>
    Task<ItemPhotoContent?> GetAsync(Guid itemId, ItemPhotoSize size, CancellationToken ct = default);

    /// <summary>Uploads or replaces the photo; the revision changes.</summary>
    Task<ItemPhotoDto> SaveAsync(Guid itemId, PhotoUpload image, PhotoUpload thumbnail, CancellationToken ct = default);

    Task RemoveAsync(Guid itemId, CancellationToken ct = default);
}

public sealed class ItemPhotoService(IAppDbContext db, IClock clock, ICurrentUser currentUser) : IItemPhotoService
{
    public async Task<ItemPhotoContent?> GetAsync(Guid itemId, ItemPhotoSize size, CancellationToken ct = default)
    {
        var photos = db.ItemPhotos.AsNoTracking().Where(p => p.ItemId == itemId);
        return size == ItemPhotoSize.Full
            ? await photos.Select(p => new ItemPhotoContent(p.Image, p.ImageContentType, p.Revision)).SingleOrDefaultAsync(ct)
            : await photos.Select(p => new ItemPhotoContent(p.Thumbnail, p.ThumbnailContentType, p.Revision)).SingleOrDefaultAsync(ct);
    }

    public async Task<ItemPhotoDto> SaveAsync(Guid itemId, PhotoUpload image, PhotoUpload thumbnail, CancellationToken ct = default)
    {
        if (!await db.Items.AnyAsync(i => i.Id == itemId, ct))
            throw new NotFoundException("el artículo", itemId);

        var errors = new Dictionary<string, string[]>();
        if (ItemPhotoRules.Validate(image.Content, ItemPhoto.MaxImageSide, ItemPhoto.MaxImageBytes, out var imageInfo) is { } imageError)
            errors["image"] = [imageError];
        if (ItemPhotoRules.Validate(thumbnail.Content, ItemPhoto.MaxThumbnailSide, ItemPhoto.MaxThumbnailBytes, out var thumbInfo) is { } thumbError)
            errors["thumbnail"] = [thumbError];
        if (errors.Count > 0)
            throw new RequestValidationException(errors);

        var photo = await db.ItemPhotos.SingleOrDefaultAsync(p => p.ItemId == itemId, ct);
        if (photo is null)
        {
            photo = new ItemPhoto(itemId, image.Content, imageInfo!.ContentType, thumbnail.Content, thumbInfo!.ContentType,
                clock.UtcNow, currentUser.UserId);
            db.ItemPhotos.Add(photo);
        }
        else
        {
            photo.Replace(image.Content, imageInfo!.ContentType, thumbnail.Content, thumbInfo!.ContentType, clock.UtcNow, currentUser.UserId);
        }
        await db.SaveChangesAsync(ct);
        return new ItemPhotoDto(itemId, photo.Revision, photo.ImageContentType, photo.Image.Length, photo.ThumbnailContentType,
            photo.Thumbnail.Length, photo.UpdatedAt);
    }

    public async Task RemoveAsync(Guid itemId, CancellationToken ct = default)
    {
        if (!await db.Items.AnyAsync(i => i.Id == itemId, ct))
            throw new NotFoundException("el artículo", itemId);
        await db.ItemPhotos.Where(p => p.ItemId == itemId).ExecuteDeleteAsync(ct);
    }
}
