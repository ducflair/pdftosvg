using System.Text.Json.Serialization;

namespace PdfToSvgWasm;

[JsonSourceGenerationOptions(
    PropertyNameCaseInsensitive = true,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull)]
[JsonSerializable(typeof(PdfToSvgExports.ConversionOptionsPayload))]
internal partial class PdfToSvgJsonContext : JsonSerializerContext
{
}
