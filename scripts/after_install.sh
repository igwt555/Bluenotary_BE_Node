#!/bin/bash

# mkdir /home/ubuntu/my-app1
# cd /home/ubuntu/my-app1
cd /var/www/umkautolitool
npm run deploy
sudo chown -R $(whoami):$(whoami) /var/www/umkautolitool
