from PIL import Image
from PIL import ImageFont
from PIL import ImageDraw
from datetime import datetime
import sys
import os
  
img = Image.open(sys.argv[5])
draw = ImageDraw.Draw(img)
expireDate = datetime.fromtimestamp(int(sys.argv[4])).strftime('%m/%d/%Y')  

noSealTemplates = ["Alabama.jpg", "Alaska.jpg", "American Samoa.jpg", "Arkansas.jpg", "California.jpg", "Colorado.jpg", "Delaware.jpg", "District Of Columbia.jpg", "Georgia.jpg", "Guam.jpg", "Hawaii.jpg", "Idaho.jpg", "Illinois.jpg", "Indiana.jpg", "Iowa.jpg", "Kansas.jpg", "Kentucky.jpg", "Louisiana.jpg", "Maine.jpg", "Maryland.jpg", "Massachusetts.jpg", "Mississippi.jpg", "Missouri.jpg", "Nebraska.jpg", "Nevada.jpg", "New Hampshire.jpg", "New Jersey.jpg", "New York.jpg", "North Carolina.jpg", "North Dakota.jpg", "Oklahoma.jpg", "Pennsylvania.jpg", "Puerto Rico.jpg", "Rhode Island.jpg", "South Carolina.jpg", "South Dakota.jpg", "Vermont.jpg", "Washington.jpg", "West Virginia.jpg", "Wisconsin.jpg", "Wyoming.jpg"]
currentTemplate = os.path.basename(sys.argv[5])
if currentTemplate in noSealTemplates:
    startx = 0
else:
    startx = 170

x, y = [startx, 28]
font = ImageFont.truetype("public/fonts/OpenSans-Regular.ttf", 20)

w1, h1 = draw.textsize(sys.argv[2], font=font)
x1 = (500 - x - w1) / 2
draw.text((x + x1, y), sys.argv[2], (0, 0, 0), font=font)

w2, h2 = draw.textsize('Electronic Notary Public', font=font)
x2 = (500 - x - w2) / 2
draw.text((x + x2, y + 25), 'Electronic Notary Public', (0, 0, 0), font=font)

w3, h3 = draw.textsize('State of '+sys.argv[1], font=font)
x3 = (500 - x - w3) / 2
draw.text((x + x3, y + 50), 'State of '+sys.argv[1], (0, 0, 0), font=font)

w4, h4 = draw.textsize('Commission #: '+sys.argv[3], font=font)
x4 = (500 - x - w4) / 2
draw.text((x + x4, y + 75), 'Commission #: '+sys.argv[3], (0, 0, 0), font=font)

w5, h5 = draw.textsize('Commission Expires: '+expireDate, font=font)
x5 = (500 - x - w5) / 2
draw.text((x + x5, y + 100), 'Commission Expires: '+expireDate, (0, 0, 0), font=font)
  
data = img.save('public/templates/seal-'+sys.argv[3]+'.jpg')
print('public/templates/seal-'+sys.argv[3]+'.jpg')