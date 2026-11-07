# Remove green-screen background, despill, crop and resize sprites for the game.
from PIL import Image
import numpy as np, sys
SRC='/home/user/CoffeeIT1/art/src/'; DST='/home/user/CoffeeIT1/game/assets/'
def key(name, height):
    im=np.array(Image.open(SRC+name+'.png').convert('RGBA')).astype(np.float32)
    r,g,b=im[...,0],im[...,1],im[...,2]
    greenness=g-np.maximum(r,b)
    a=np.clip(1-(greenness-40)/80,0,1)   # >120 fully transparent, <40 opaque
    # despill: clamp green to max(r,b) where it dominates
    spill=g>np.maximum(r,b)
    im[...,1]=np.where(spill, np.maximum(r,b)+ (g-np.maximum(r,b))*0.2*(a>0.99), g)
    im[...,3]=a*255
    img=Image.fromarray(im.clip(0,255).astype(np.uint8))
    bbox=img.getchannel('A').point(lambda v:255 if v>20 else 0).getbbox()
    img=img.crop(bbox)
    w=round(img.width*height/img.height)
    img=img.resize((w,height),Image.LANCZOS)
    img.save(DST+name+'.png'); print(name,img.size)
key('jim',300); key('princess',300); key('crow',160); key('cow',180)
bg=Image.open(SRC+'bg.png').convert('RGB'); bg=bg.resize((round(bg.width*720/bg.height),720),Image.LANCZOS)
bg.save(DST+'bg.jpg',quality=85); print('bg',bg.size)
