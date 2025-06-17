


mongod --config "C:\Program Files\MongoDB\Server\8.0\rs0\27017\bin\mongod.cfg" --serviceName mongo-primary --serviceDisplayName "MongoDB Primary" --install
mongod --config "C:\Program Files\MongoDB\Server\8.0\rs0\27018\bin\mongod.cfg" --serviceName mongo-secondary-18 --serviceDisplayName "MongoDB Secondary 1" --install
mongod --config "C:\Program Files\MongoDB\Server\8.0\rs0\27019\bin\mongod.cfg" --serviceName mongo-secondary-19 --serviceDisplayName "MongoDB Secondary 2" --install

net start mongo-primary
net start mongo-secondary-18
net start mongo-secondary-19