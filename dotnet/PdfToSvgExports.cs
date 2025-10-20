using System;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices.JavaScript;
using System.Text.Json;
using PdfToSvg;

namespace PdfToSvgWasm;

/// <summary>
/// JavaScript exports bridging PdfToSvg.NET into WebAssembly.
/// </summary>
public static partial class PdfToSvgExports
{
    /// <summary>
    /// Converts the provided PDF bytes into SVG markup for each page.
    /// </summary>
    /// <param name="pdfBytes">PDF document contents.</param>
    /// <param name="optionsJson">
    /// Optional JSON string describing conversion options. See the documentation in <c>ConversionOptions</c> for details.
    /// </param>
    /// <returns>Array of SVG fragments, one entry per converted page.</returns>
    [JSExport]
    public static string[] ConvertPdfToSvg(byte[] pdfBytes, string? optionsJson = null)
    {
        ArgumentNullException.ThrowIfNull(pdfBytes);

        if (pdfBytes.Length == 0)
        {
            return Array.Empty<string>();
        }

        var options = ParseOptions(optionsJson);

        using var pdfStream = new MemoryStream(pdfBytes, writable: false);
        using var document = PdfDocument.Open(pdfStream, leaveOpen: false, options.OpenOptions);

        var pageIndices = options.PageFilter ?? Enumerable.Range(0, document.Pages.Count).ToArray();
        var result = new string[pageIndices.Length];

        var svgOptions = options.SvgOptions;

        for (var i = 0; i < pageIndices.Length; i++)
        {
            var pageIndex = pageIndices[i];
            if (pageIndex < 0 || pageIndex >= document.Pages.Count)
            {
                throw new ArgumentOutOfRangeException(nameof(options.PageFilter), pageIndex, "Page index out of range.");
            }

            var page = document.Pages[pageIndex];
            result[i] = page.ToSvgString(svgOptions);
        }

        return result;
    }

    private static ConversionOptions ParseOptions(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return ConversionOptions.Default;
        }

        try
        {
            var options = JsonSerializer.Deserialize(json, PdfToSvgJsonContext.Default.ConversionOptionsPayload);
            return ConversionOptions.FromPayload(options);
        }
        catch (JsonException ex)
        {
            throw new ArgumentException("Failed to parse conversion options JSON.", nameof(json), ex);
        }
    }

    private sealed record ConversionOptions(
        OpenOptions OpenOptions,
        SvgConversionOptions SvgOptions,
        int[]? PageFilter)
    {
        public static ConversionOptions Default => new(new OpenOptions(), new SvgConversionOptions(), null);

        public static ConversionOptions FromPayload(ConversionOptionsPayload? payload)
        {
            if (payload == null)
            {
                return Default;
            }

            var openOptions = new OpenOptions
            {
                Password = payload.Password,
            };

            var svgOptions = new SvgConversionOptions
            {
                IncludeAnnotations = payload.IncludeAnnotations ?? true,
                IncludeHiddenText = payload.IncludeHiddenText ?? true,
                IncludeLinks = payload.IncludeLinks ?? true,
                CollapseSpaceEmbeddedFont = payload.CollapseSpaceEmbeddedFont ?? SvgConversionOptionsDefaults.CollapseSpaceEmbeddedFont,
                CollapseSpaceLocalFont = payload.CollapseSpaceLocalFont ?? SvgConversionOptionsDefaults.CollapseSpaceLocalFont,
                MinStrokeWidth = payload.MinStrokeWidth ?? SvgConversionOptionsDefaults.MinStrokeWidth,
            };

            if (!string.IsNullOrWhiteSpace(payload.FontStrategy))
            {
                svgOptions.FontResolver = payload.FontStrategy!.ToLowerInvariant() switch
                {
                    "local" => FontResolver.LocalFonts,
                    "opentype" => FontResolver.EmbedOpenType,
                    "woff" => FontResolver.EmbedWoff,
                    _ => throw new ArgumentException($"Unknown font strategy '{payload.FontStrategy}'."),
                };
            }

            int[]? pages = null;
            if (payload.Pages != null && payload.Pages.Length > 0)
            {
                pages = payload.Pages.Where(p => p != null).Select(p => p!.Value).ToArray();
            }

            return new ConversionOptions(openOptions, svgOptions, pages);
        }
    }

    internal sealed class ConversionOptionsPayload
    {
        public string? Password { get; set; }
        public bool? IncludeAnnotations { get; set; }
        public bool? IncludeHiddenText { get; set; }
        public bool? IncludeLinks { get; set; }
        public double? CollapseSpaceEmbeddedFont { get; set; }
        public double? CollapseSpaceLocalFont { get; set; }
        public double? MinStrokeWidth { get; set; }
        public string? FontStrategy { get; set; }
        public int?[]? Pages { get; set; }
    }

    private static class SvgConversionOptionsDefaults
    {
        public static double CollapseSpaceEmbeddedFont => new SvgConversionOptions().CollapseSpaceEmbeddedFont;
        public static double CollapseSpaceLocalFont => new SvgConversionOptions().CollapseSpaceLocalFont;
        public static double MinStrokeWidth => new SvgConversionOptions().MinStrokeWidth;
    }
}
