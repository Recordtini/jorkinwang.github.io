import importlib.util
import io
import json
import pathlib
import tempfile
import unittest
from PIL import Image

spec = importlib.util.spec_from_file_location("build_pages", pathlib.Path(__file__).with_name("build_pages.py"))
pages = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pages)


class PagesBuildTests(unittest.TestCase):
    def png(self):
        image = Image.new("RGBA", (16, 16))
        image.putdata([(x*15, y*15, 95, (x+y)*8) for y in range(16) for x in range(16)])
        output = io.BytesIO()
        image.save(output, format="PNG")
        return output.getvalue()

    def test_encoder_alpha_and_lossless_pixels_including_cached_results(self):
        payload = self.png()
        original = Image.open(io.BytesIO(payload)).convert("RGBA")
        with tempfile.TemporaryDirectory() as folder:
            encoder = pages.Encoder(pathlib.Path(folder))
            for lossless in [False, True]:
                output = encoder.encode(payload, lossless)
                decoded = Image.open(io.BytesIO(output)).convert("RGBA")
                self.assertEqual(original.getchannel("A").tobytes(), decoded.getchannel("A").tobytes())
                if lossless:
                    self.assertEqual(original.tobytes(), decoded.tobytes())
                self.assertEqual(output, encoder.encode(payload, lossless))

    def test_glb_keeps_every_geometry_byte_and_native_property(self):
        png = self.png()
        geometry = bytes(range(16))
        document = {"asset": {"version": "2.0"}, "buffers": [{"byteLength": 16+len(png)}],
                    "bufferViews": [{"buffer": 0, "byteOffset": 0, "byteLength": 16},
                                    {"buffer": 0, "byteOffset": 16, "byteLength": len(png)}],
                    "images": [{"bufferView": 1, "mimeType": "image/png", "name": "normal"}],
                    "textures": [{"source": 0, "sampler": 0}], "samplers": [{}],
                    "accessors": [{"bufferView": 0, "componentType": 5126, "count": 1, "type": "VEC4"}],
                    "nodes": [{"name": "Native", "translation": [1,2,3], "extras": {"nif_uv": 2}}],
                    "materials": [{"normalTexture": {"index": 0, "texCoord": 1}, "extras": {"dark": "keep.tga"}}],
                    "animations": [], "extensionsUsed": ["KHR_lights_punctual"]}
        source = pages.write_glb(document, geometry+png)
        with tempfile.TemporaryDirectory() as folder:
            encoder = pages.Encoder(pathlib.Path(folder))
            encoded = pages.repack_glb(source, encoder)
            actual, binary = pages.read_glb(encoded)
            self.assertEqual(pages.view_bytes(actual, binary, 0), geometry)
            for field in ["nodes", "materials", "accessors", "samplers", "animations"]:
                self.assertEqual(actual[field], document[field])
            self.assertEqual(actual["textures"][0], {"sampler":0, "extensions":{"EXT_texture_webp":{"source":0}}})
            self.assertIn("KHR_lights_punctual", actual["extensionsUsed"])
            self.assertIn("EXT_texture_webp", actual["extensionsRequired"])
            self.assertEqual(encoder.counts["lossless"], 1)

    def test_runtime_static_and_dynamic_png_references_and_cache_keys(self):
        source = "load('assets/map.png?v=old'); load(name+'.png'); import './scene.js?v=old-version';"
        result = pages.rewrite_runtime(source)
        self.assertIn("assets/map.webp?v="+pages.VERSION, result)
        self.assertIn("name+'.webp'", result)
        self.assertIn("scene.js?v="+pages.VERSION, result)
        self.assertEqual(pages.rewrite_runtime(result), result)

    def test_json_minification_preserves_unicode_and_values(self):
        source = {"category":"Caf\u00e9", "keys":[1, .25, None, True]}
        self.assertEqual(json.loads(pages.compact(source)), source)

    def test_json_reference_changes_do_not_rename_native_lookup_keys(self):
        source = {"Native.png": {"url": "assets/a.png", "frames": [1, 2, None]}}
        result = pages.rewrite_json_refs(source)
        self.assertEqual(result, {"Native.png": {"url": "assets/a.webp", "frames": [1, 2, None]}})
        self.assertEqual(source["Native.png"]["url"], "assets/a.png")


if __name__ == "__main__":
    unittest.main()
