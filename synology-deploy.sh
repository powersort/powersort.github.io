find . -type f -exec chmod 644 {} \;
find . -type d -exec chmod 755 {} \;
chmod +x pen-down/worker/node_modules/.bin/*
chmod +x powersorts-pursuit-v5/worker/node_modules/.bin/*
chmod +x synology-deploy.sh
rsync -e 'ssh -p 222' -av --copy-links --delete ./ Sebastian@disk.wild-inter.net:/volume1/web/powersort/ --exclude=.git --exclude=.gitignore --exclude /synology-deploy.sh --exclude \*.zip --exclude powersorts-pursuit-v\* --exclude pen-down-v\* --exclude playground --exclude pen-down/worker --exclude pen-down/src
ssh -p222 Sebastian@disk.wild-inter.net 'chmod -R go+r /volume1/web/*'
