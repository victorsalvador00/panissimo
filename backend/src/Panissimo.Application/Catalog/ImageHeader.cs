using System.Buffers.Binary;

namespace Panissimo.Application.Catalog;

/// <summary>The real type and dimensions of an image, read from its header.</summary>
public sealed record ImageInfo(string ContentType, int Width, int Height);

/// <summary>
/// Reads the header of a PNG, JPEG or WebP image without an image library (no <c>SixLabors.*</c>, backend §2): enough to
/// reject a file that is not an image or is larger than allowed. It does not decode the pixels.
/// </summary>
public static class ImageHeader
{
    public const string Png = "image/png";
    public const string Jpeg = "image/jpeg";
    public const string Webp = "image/webp";

    private static readonly byte[] PngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

    /// <summary>Null when the bytes are not a PNG, JPEG or WebP image with readable dimensions.</summary>
    public static ImageInfo? Read(ReadOnlySpan<byte> data)
    {
        try
        {
            if (data.Length >= 24 && data[..8].SequenceEqual(PngSignature) && data.Slice(12, 4).SequenceEqual("IHDR"u8))
                return Valid(Png, BinaryPrimitives.ReadInt32BigEndian(data.Slice(16, 4)), BinaryPrimitives.ReadInt32BigEndian(data.Slice(20, 4)));
            if (data.Length >= 4 && data[0] == 0xFF && data[1] == 0xD8)
                return Jpg(data);
            if (data.Length >= 30 && data[..4].SequenceEqual("RIFF"u8) && data.Slice(8, 4).SequenceEqual("WEBP"u8))
                return WebP(data);
        }
        catch (ArgumentOutOfRangeException)
        {
            // Truncated header.
        }
        return null;
    }

    private static ImageInfo? Valid(string type, int width, int height) =>
        width > 0 && height > 0 ? new ImageInfo(type, width, height) : null;

    /// <summary>Walks the segments up to the frame header (SOF0..SOF15 except DHT, JPG and DAC).</summary>
    private static ImageInfo? Jpg(ReadOnlySpan<byte> data)
    {
        var i = 2;
        while (i + 4 <= data.Length)
        {
            if (data[i] != 0xFF)
                return null;
            var marker = data[i + 1];
            if (marker == 0xFF)
            {
                i++; // fill byte
                continue;
            }
            if (marker is 0x01 or >= 0xD0 and <= 0xD7)
            {
                i += 2; // markers without length
                continue;
            }
            if (marker is 0xD9 or 0xDA)
                return null; // end of image or start of scan before any frame header
            var length = BinaryPrimitives.ReadUInt16BigEndian(data.Slice(i + 2, 2));
            if (marker is >= 0xC0 and <= 0xCF and not 0xC4 and not 0xC8 and not 0xCC)
                return Valid(Jpeg, BinaryPrimitives.ReadUInt16BigEndian(data.Slice(i + 7, 2)), BinaryPrimitives.ReadUInt16BigEndian(data.Slice(i + 5, 2)));
            i += 2 + length;
        }
        return null;
    }

    private static ImageInfo? WebP(ReadOnlySpan<byte> data)
    {
        var chunk = data.Slice(12, 4);
        if (chunk.SequenceEqual("VP8 "u8))
            return Valid(Webp, BinaryPrimitives.ReadUInt16LittleEndian(data.Slice(26, 2)) & 0x3FFF,
                BinaryPrimitives.ReadUInt16LittleEndian(data.Slice(28, 2)) & 0x3FFF);
        if (chunk.SequenceEqual("VP8L"u8))
        {
            if (data[20] != 0x2F)
                return null;
            int b0 = data[21], b1 = data[22], b2 = data[23], b3 = data[24];
            return Valid(Webp, 1 + (((b1 & 0x3F) << 8) | b0), 1 + (((b3 & 0x0F) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6)));
        }
        if (chunk.SequenceEqual("VP8X"u8))
            return Valid(Webp, 1 + (data[24] | (data[25] << 8) | (data[26] << 16)), 1 + (data[27] | (data[28] << 8) | (data[29] << 16)));
        return null;
    }
}
