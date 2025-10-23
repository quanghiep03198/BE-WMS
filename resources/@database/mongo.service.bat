set MONGO_BASE_PATH=

mongod --config "%MONGO_BASE_PATH%/27017/bin/mongod.conf" --serviceName mongo-primary --serviceDisplayName "MongoDB Primary" --install
mongod --config "%MONGO_BASE_PATH%/27018/bin/mongod.conf" --serviceName mongo-secondary-18 --serviceDisplayName "MongoDB Secondary 1" --install
mongod --config "%MONGO_BASE_PATH%/27019/bin/mongod.conf" --serviceName mongo-secondary-19 --serviceDisplayName "MongoDB Secondary 2" --install

net start mongo-primary
net start mongo-secondary-18
net start mongo-secondary-19