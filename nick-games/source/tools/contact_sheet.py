from PIL import Image,ImageDraw
from pathlib import Path
for game in ['runaway-bus','stupor-highway']:
 files=list((Path('assets')/game/'textures').glob('*.png'))
 files=[p for p in files if not p.stem.endswith('sp')][:100]
 sheet=Image.new('RGB',(800,((len(files)+7)//8)*90),'#444444');d=ImageDraw.Draw(sheet)
 for i,p in enumerate(files):
  im=Image.open(p);im.thumbnail((90,65));x=(i%8)*100;y=(i//8)*90;sheet.paste(im,(x,y),im);d.text((x,y+66),p.stem[:15],fill='white')
 sheet.save('/tmp/nick-'+game+'.png')
