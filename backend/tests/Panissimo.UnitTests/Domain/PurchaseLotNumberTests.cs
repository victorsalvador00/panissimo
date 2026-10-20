using Panissimo.Domain.Purchasing;

namespace Panissimo.UnitTests.Domain;

/// <summary>RN-117: lot of a goods receipt = {SKU without separators}-{DDMMYY}-{NN}.</summary>
public class PurchaseLotNumberTests
{
    private static readonly DateOnly October20 = new(2026, 10, 20);

    [Theory]
    [InlineData("MP-001", "MP001-201026-")]
    [InlineData("mp.001_a", "MP001A-201026-")]
    [InlineData("HARINA", "HARINA-201026-")]
    public void Prefix_is_the_sku_without_separators_and_the_date(string sku, string prefix) =>
        Assert.Equal(prefix, PurchaseLotNumber.Prefix(sku, October20));

    [Fact]
    public void Prefix_uses_two_digits_for_day_month_and_year() =>
        Assert.Equal("MP001-050126-", PurchaseLotNumber.Prefix("MP-001", new DateOnly(2026, 1, 5)));

    [Fact]
    public void A_long_sku_is_cut_so_the_lot_fits_in_50_characters()
    {
        var lot = PurchaseLotNumber.Format(PurchaseLotNumber.Prefix(new string('A', 50), October20), 999);
        Assert.Equal(50, lot.Length);
    }

    [Fact]
    public void The_first_receipt_of_the_day_is_01()
    {
        Assert.Equal("MP001-201026-01", PurchaseLotNumber.Next("MP001-201026-", []));
    }

    [Fact]
    public void Next_follows_the_highest_sequence_and_ignores_lots_captured_by_hand()
    {
        string[] existing = ["MP001-201026-01", "MP001-201026-03", "MP001-201026-X", "MP001-201026-"];
        Assert.Equal("MP001-201026-04", PurchaseLotNumber.Next("MP001-201026-", existing));
    }

    [Fact]
    public void After_99_the_sequence_grows_to_three_digits() =>
        Assert.Equal("MP001-201026-100", PurchaseLotNumber.Next("MP001-201026-", ["MP001-201026-99"]));
}
