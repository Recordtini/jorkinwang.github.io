#!/usr/bin/env python3
"""Regression checks for the original Director bitmap and asset export formats."""
import struct, unittest, json
from pathlib import Path
from extract import png_image, unpackbits, macpal
class Bitmaps(unittest.TestCase):
    def test_compressed_rgb555_planes_preserve_classic_orange(self):
        header=bytearray(24);struct.pack_into('>Hhhhh',header,0,0x8008,0,0,1,4);header[23]=16
        # Four high bytes, then four low bytes; this is not interleaved RGB555.
        image=png_image(bytes([253,0x7d,253,0xe0]),header,macpal)
        self.assertEqual([image.getpixel((x,0)) for x in range(image.width)],[(255,123,0,255)]*4)
    def test_uncompressed_rgb555_is_interleaved(self):
        header=bytearray(24);struct.pack_into('>Hhhhh',header,0,0x8004,0,0,1,2);header[23]=16
        image=png_image(bytes([0x7c,0,0x03,0xe0]),header,macpal)
        self.assertEqual([image.getpixel((x,0)) for x in range(image.width)],[(255,0,0,255),(0,255,0,255)])
    def test_packbits_literal_and_repeat(self):
        self.assertEqual(unpackbits(bytes([1,12,34,254,56]),5),bytes([12,34,56,56,56]))
    def test_complete_export_has_no_warnings(self):
        root=Path(__file__).resolve().parents[1]
        for game,counts in [('runaway-bus',(38,340,26)),('stupor-highway',(22,126,19))]:
            manifest=json.loads((root/'assets'/game/'manifest.json').read_text())
            self.assertEqual(manifest['warnings'],[])
            self.assertEqual(tuple(len(manifest[k]) for k in ['models','textures','sounds']),counts)
            for kind in ['models','textures','sounds']:
                for item in manifest[kind].values():self.assertTrue((root/'assets'/game/item['file']).is_file())
if __name__=='__main__':unittest.main()
