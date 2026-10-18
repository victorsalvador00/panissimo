using System.Buffers.Binary;
using System.Net;
using System.Net.Http.Headers;
using Panissimo.Application.Catalog;
using Panissimo.Application.Common;
using Panissimo.Domain.Catalog;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Catalog;

[Collection(ApiCollection.Name)]
public class ItemPhotoTests(ApiFactory factory)
{
    /// <summary>A PNG header with the given dimensions (the server reads the header, never the pixels).</summary>
    private static byte[] Png(int width, int height, int padding = 0)
    {
        var data = new byte[33 + padding];
        new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }.CopyTo(data, 0);
        BinaryPrimitives.WriteInt32BigEndian(data.AsSpan(8), 13);
        "IHDR"u8.CopyTo(data.AsSpan(12));
        BinaryPrimitives.WriteInt32BigEndian(data.AsSpan(16), width);
        BinaryPrimitives.WriteInt32BigEndian(data.AsSpan(20), height);
        return data;
    }

    private static byte[] Jpeg(int width, int height) =>
        [0xFF, 0xD8, 0xFF, 0xC0, 0x00, 0x11, 0x08, (byte)(height >> 8), (byte)height, (byte)(width >> 8), (byte)width, 0x03, .. new byte[15], 0xFF, 0xD9];

    private static Task<HttpResponseMessage> UploadAsync(HttpClient client, Guid itemId, byte[]? image, byte[]? thumbnail,
        string declaredType = "image/png")
    {
        var form = new MultipartFormDataContent();
        if (image is not null)
            form.Add(new ByteArrayContent(image) { Headers = { ContentType = new MediaTypeHeaderValue(declaredType) } }, "image", "foto.png");
        if (thumbnail is not null)
            form.Add(new ByteArrayContent(thumbnail) { Headers = { ContentType = new MediaTypeHeaderValue(declaredType) } }, "thumbnail", "mini.png");
        return client.PutAsync($"/api/v1/items/{itemId}/photo", form);
    }

    [Fact]
    public async Task Upload_replace_cache_and_delete_a_photo()
    {
        var admin = await factory.LoginAsAdminAsync();
        var item = await factory.CreateItemAsync("TRENZA", ItemType.FinishedGood, "pza");
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/v1/items/{item.Id}/photo")).StatusCode);

        var upload = await UploadAsync(admin, item.Id, Png(512, 384), Png(96, 72));
        Assert.Equal(HttpStatusCode.OK, upload.StatusCode);
        var first = (await upload.Content.ReadJsonAsync<ItemPhotoDto>())!;
        Assert.Equal((ImageHeader.Png, 33, ImageHeader.Png), (first.ImageContentType, first.ImageBytes, first.ThumbnailContentType));

        // The revision travels in the item DTOs.
        Assert.Equal(first.Revision, (await admin.GetJsonAsync<ItemDto>($"/api/v1/items/{item.Id}"))!.PhotoRevision);
        Assert.Equal(first.Revision, (await admin.GetJsonAsync<List<ItemLookupDto>>($"/api/v1/items/lookup?q={item.Sku}"))!.Single().PhotoRevision);
        Assert.Equal(first.Revision, (await admin.GetJsonAsync<PagedResult<ItemListItemDto>>($"/api/v1/items?q={item.Sku}"))!.Items.Single().PhotoRevision);

        // Thumbnail by default, with ETag; the same ETag answers 304 without body.
        var thumbnail = await admin.GetAsync($"/api/v1/items/{item.Id}/photo");
        Assert.Equal((HttpStatusCode.OK, "image/png", 33L), (thumbnail.StatusCode, thumbnail.Content.Headers.ContentType!.MediaType!,
            thumbnail.Content.Headers.ContentLength!.Value));
        var etag = thumbnail.Headers.ETag!;
        Assert.Equal($"\"{first.Revision}-thumbnail\"", etag.Tag);
        using var conditional = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/items/{item.Id}/photo") { Headers = { IfNoneMatch = { etag } } };
        Assert.Equal(HttpStatusCode.NotModified, (await admin.SendAsync(conditional)).StatusCode);
        var full = await admin.GetAsync($"/api/v1/items/{item.Id}/photo?size=full");
        Assert.Equal($"\"{first.Revision}-full\"", full.Headers.ETag!.Tag);

        // Replacing (now JPEG, whatever the browser declared) changes the revision: the old ETag no longer matches.
        var second = (await (await UploadAsync(admin, item.Id, Jpeg(400, 300), Jpeg(96, 72))).Content.ReadJsonAsync<ItemPhotoDto>())!;
        Assert.True(second.Revision > first.Revision);
        Assert.Equal(ImageHeader.Jpeg, second.ImageContentType);
        using var stale = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/items/{item.Id}/photo") { Headers = { IfNoneMatch = { etag } } };
        var fresh = await admin.SendAsync(stale);
        Assert.Equal((HttpStatusCode.OK, "image/jpeg"), (fresh.StatusCode, fresh.Content.Headers.ContentType!.MediaType!));

        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/v1/items/{item.Id}/photo")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/v1/items/{item.Id}/photo")).StatusCode);
        Assert.Null((await admin.GetJsonAsync<ItemDto>($"/api/v1/items/{item.Id}"))!.PhotoRevision);
    }

    [Fact]
    public async Task Invalid_type_size_and_dimensions_are_rejected()
    {
        var admin = await factory.LoginAsAdminAsync();
        var item = await factory.CreateItemAsync("CONCHA", ItemType.FinishedGood, "pza");

        var notImage = await UploadAsync(admin, item.Id, "<svg/>"u8.ToArray(), Png(96, 96), "image/svg+xml");
        Assert.Equal(HttpStatusCode.BadRequest, notImage.StatusCode);
        Assert.Contains("no es una imagen PNG, JPEG o WebP", await notImage.Content.ReadAsStringAsync());

        var tooWide = await UploadAsync(admin, item.Id, Png(513, 300), Png(200, 96));
        var errors = await tooWide.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.BadRequest, tooWide.StatusCode);
        Assert.Contains("513×300 px", errors);
        Assert.Contains("200×96 px", errors);

        var missing = await UploadAsync(admin, item.Id, Png(100, 100), null);
        Assert.Contains("Falta la imagen.", await missing.Content.ReadAsStringAsync());

        var heavyThumbnail = await UploadAsync(admin, item.Id, Png(100, 100), Png(96, 96, 60 * 1024));
        Assert.Contains("el máximo es 50 KB", await heavyThumbnail.Content.ReadAsStringAsync());

        var tooLarge = await UploadAsync(admin, item.Id, Png(512, 512, 450 * 1024), Png(96, 96));
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, tooLarge.StatusCode);
        Assert.Contains("excede el tamaño permitido (400 KB)", await tooLarge.Content.ReadAsStringAsync());

        Assert.Equal(HttpStatusCode.NotFound, (await UploadAsync(admin, Guid.NewGuid(), Png(10, 10), Png(10, 10))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/v1/items/{item.Id}/photo")).StatusCode);
    }

    [Fact]
    public async Task Viewing_needs_any_lookup_permission_and_changing_needs_catalog_manage()
    {
        var admin = await factory.LoginAsAdminAsync();
        var item = await factory.CreateItemAsync("BOLILLO", ItemType.FinishedGood, "pza");
        Assert.Equal(HttpStatusCode.OK, (await UploadAsync(admin, item.Id, Png(100, 100), Png(96, 96))).StatusCode);

        var email = ApiFactory.UniqueEmail("fotos");
        await factory.CreateUserAsync(email, ["branch_manager"], ["SUC-01"]);
        var manager = await factory.LoginAsync(email);
        Assert.Equal(HttpStatusCode.OK, (await manager.GetAsync($"/api/v1/items/{item.Id}/photo")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await UploadAsync(manager, item.Id, Png(100, 100), Png(96, 96))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await manager.DeleteAsync($"/api/v1/items/{item.Id}/photo")).StatusCode);

        var anonymous = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync($"/api/v1/items/{item.Id}/photo")).StatusCode);
    }
}
