#!/bin/bash
cd /var/www/umkautolitool
#npm install
#sudo pkill -f PM2
#ps aux | grep pm2 | grep -v grep | awk '{print $2}' | xargs kill -9
#npm start
#NODE_ENV=production pm2 start server.js
# sudo npm install pm2@latest -g
#sudo systemctl start pm2-ubuntu
pm2 stop 0
pm2 start dist/index.js
