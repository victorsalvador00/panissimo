namespace Panissimo.Domain.Catalog;

/// <summary>
/// One photo per item, to recognize products in the pickers (dominio §3). The browser resizes it; the server only checks
/// its real type, size and dimensions. <see cref="Revision"/> changes on every upload and serves as cache key: it comes from
/// the upload time, so a photo deleted and uploaded again never repeats a revision a browser may have cached.
/// </summary>
public class ItemPhoto
{
    public const int MaxImageSide = 512;
    public const int MaxThumbnailSide = 96;
    public const int MaxImageBytes = 300 * 1024;
    public const int MaxThumbnailBytes = 50 * 1024;

    private ItemPhoto() { }

    public ItemPhoto(Guid itemId, byte[] image, string imageContentType, byte[] thumbnail, string thumbnailContentType,
        DateTimeOffset at, Guid? by)
    {
        ItemId = itemId;
        Set(image, imageContentType, thumbnail, thumbnailContentType, at, by);
        Revision = at.ToUnixTimeMilliseconds();
    }

    public Guid ItemId { get; private set; }
    public long Revision { get; private set; }
    public byte[] Image { get; private set; } = null!;
    public string ImageContentType { get; private set; } = null!;
    public byte[] Thumbnail { get; private set; } = null!;
    public string ThumbnailContentType { get; private set; } = null!;
    public DateTimeOffset UpdatedAt { get; private set; }
    public Guid? UpdatedBy { get; private set; }

    public void Replace(byte[] image, string imageContentType, byte[] thumbnail, string thumbnailContentType, DateTimeOffset at, Guid? by)
    {
        Set(image, imageContentType, thumbnail, thumbnailContentType, at, by);
        Revision = Math.Max(Revision + 1, at.ToUnixTimeMilliseconds());
    }

    private void Set(byte[] image, string imageContentType, byte[] thumbnail, string thumbnailContentType, DateTimeOffset at, Guid? by)
    {
        Image = image;
        ImageContentType = imageContentType;
        Thumbnail = thumbnail;
        ThumbnailContentType = thumbnailContentType;
        UpdatedAt = at;
        UpdatedBy = by;
    }
}
