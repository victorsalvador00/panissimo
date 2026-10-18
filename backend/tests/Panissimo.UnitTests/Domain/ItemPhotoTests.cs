using System.Buffers.Binary;
using System.Text;
using Panissimo.Application.Catalog;
using Panissimo.Domain.Catalog;

namespace Panissimo.UnitTests.Domain;

/// <summary>Image headers built by hand: the reader only looks at the header, never at the pixels.</summary>
public static class TestImages
{
    public static byte[] Png(int width, int height, int padding = 0)
    {
        var data = new byte[33 + padding];
        new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }.CopyTo(data, 0);
        BinaryPrimitives.WriteInt32BigEndian(data.AsSpan(8), 13);
        "IHDR"u8.CopyTo(data.AsSpan(12));
        BinaryPrimitives.WriteInt32BigEndian(data.AsSpan(16), width);
        BinaryPrimitives.WriteInt32BigEndian(data.AsSpan(20), height);
        return data;
    }

    /// <summary>SOI, an APP0 (JFIF) segment and a baseline frame header.</summary>
    public static byte[] Jpeg(int width, int height)
    {
        var data = new List<byte> { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10 };
        data.AddRange(Encoding.ASCII.GetBytes("JFIF\0"));
        data.AddRange(new byte[9]);
        data.AddRange([0xFF, 0xC0, 0x00, 0x11, 0x08, (byte)(height >> 8), (byte)height, (byte)(width >> 8), (byte)width, 0x03]);
        data.AddRange(new byte[9]);
        data.AddRange([0xFF, 0xD9]);
        return [.. data];
    }

    /// <summary>Extended WebP (what browsers write with canvas.toBlob).</summary>
    public static byte[] WebpExtended(int width, int height)
    {
        var data = new byte[30];
        "RIFF"u8.CopyTo(data);
        BinaryPrimitives.WriteInt32LittleEndian(data.AsSpan(4), 22);
        "WEBP"u8.CopyTo(data.AsSpan(8));
        "VP8X"u8.CopyTo(data.AsSpan(12));
        BinaryPrimitives.WriteInt32LittleEndian(data.AsSpan(16), 10);
        WriteUInt24(data, 24, width - 1);
        WriteUInt24(data, 27, height - 1);
        return data;
    }

    /// <summary>Lossy WebP: frame tag, start code and 14-bit dimensions.</summary>
    public static byte[] WebpLossy(int width, int height)
    {
        var data = new byte[30];
        "RIFF"u8.CopyTo(data);
        "WEBP"u8.CopyTo(data.AsSpan(8));
        "VP8 "u8.CopyTo(data.AsSpan(12));
        new byte[] { 0x9D, 0x01, 0x2A }.CopyTo(data, 23);
        BinaryPrimitives.WriteUInt16LittleEndian(data.AsSpan(26), (ushort)width);
        BinaryPrimitives.WriteUInt16LittleEndian(data.AsSpan(28), (ushort)height);
        return data;
    }

    /// <summary>Lossless WebP: signature 0x2F and 14-bit dimensions minus one.</summary>
    public static byte[] WebpLossless(int width, int height)
    {
        var data = new byte[30];
        "RIFF"u8.CopyTo(data);
        "WEBP"u8.CopyTo(data.AsSpan(8));
        "VP8L"u8.CopyTo(data.AsSpan(12));
        data[20] = 0x2F;
        var bits = (uint)(width - 1) | ((uint)(height - 1) << 14);
        BinaryPrimitives.WriteUInt32LittleEndian(data.AsSpan(21), bits);
        return data;
    }

    private static void WriteUInt24(byte[] data, int offset, int value)
    {
        data[offset] = (byte)value;
        data[offset + 1] = (byte)(value >> 8);
        data[offset + 2] = (byte)(value >> 16);
    }
}

public class ImageHeaderTests
{
    [Fact]
    public void Reads_png_jpeg_and_webp_dimensions()
    {
        Assert.Equal(new ImageInfo(ImageHeader.Png, 512, 384), ImageHeader.Read(TestImages.Png(512, 384)));
        Assert.Equal(new ImageInfo(ImageHeader.Jpeg, 400, 300), ImageHeader.Read(TestImages.Jpeg(400, 300)));
        Assert.Equal(new ImageInfo(ImageHeader.Webp, 512, 341), ImageHeader.Read(TestImages.WebpExtended(512, 341)));
        Assert.Equal(new ImageInfo(ImageHeader.Webp, 96, 64), ImageHeader.Read(TestImages.WebpLossy(96, 64)));
        Assert.Equal(new ImageInfo(ImageHeader.Webp, 300, 200), ImageHeader.Read(TestImages.WebpLossless(300, 200)));
    }

    [Fact]
    public void Text_truncated_or_unknown_files_are_not_images()
    {
        Assert.Null(ImageHeader.Read("<svg xmlns='http://www.w3.org/2000/svg'/>"u8));
        Assert.Null(ImageHeader.Read(TestImages.Png(10, 10)[..20]));
        Assert.Null(ImageHeader.Read(TestImages.Jpeg(10, 10)[..12]));
        Assert.Null(ImageHeader.Read("GIF89a\u0001\u0000\u0001\u0000"u8));
        Assert.Null(ImageHeader.Read([]));
    }
}

public class ItemPhotoRulesTests
{
    [Fact]
    public void An_image_within_limits_is_valid_and_its_real_type_is_read()
    {
        Assert.Null(ItemPhotoRules.Validate(TestImages.Jpeg(512, 512), ItemPhoto.MaxImageSide, ItemPhoto.MaxImageBytes, out var info));
        Assert.Equal(ImageHeader.Jpeg, info!.ContentType);
    }

    [Fact]
    public void Missing_heavy_oversized_or_non_images_are_rejected()
    {
        Assert.Equal("Falta la imagen.", ItemPhotoRules.Validate([], 96, 1024, out _));
        Assert.Contains("el máximo es 50 KB", ItemPhotoRules.Validate(TestImages.Png(96, 96, 51 * 1024), 96, ItemPhoto.MaxThumbnailBytes, out _));
        Assert.Contains("513×100 px", ItemPhotoRules.Validate(TestImages.Png(513, 100), 512, ItemPhoto.MaxImageBytes, out _));
        Assert.Contains("no es una imagen", ItemPhotoRules.Validate("hola"u8.ToArray(), 512, ItemPhoto.MaxImageBytes, out _));
    }

    [Fact]
    public void Every_upload_changes_the_revision_even_within_the_same_millisecond()
    {
        var at = new DateTimeOffset(2026, 10, 17, 12, 0, 0, TimeSpan.Zero);
        var photo = new ItemPhoto(Guid.NewGuid(), [1], ImageHeader.Png, [2], ImageHeader.Png, at, null);
        var first = photo.Revision;
        photo.Replace([3], ImageHeader.Jpeg, [4], ImageHeader.Jpeg, at, null);
        Assert.Equal(first + 1, photo.Revision);
        photo.Replace([5], ImageHeader.Jpeg, [6], ImageHeader.Jpeg, at.AddMinutes(1), null);
        Assert.Equal(at.AddMinutes(1).ToUnixTimeMilliseconds(), photo.Revision);
    }
}
