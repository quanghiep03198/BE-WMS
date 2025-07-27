#!/bin/bash

BASE_PATH=;
HOST=;

mongod --replSet rs0 --bind_ip_all --port 27017 --dbpath "$BASE_PATH\27017\data";
mongod --replSet rs0 --bind_ip_all --port 27018 --dbpath "$BASE_PATH\27018\data";
mongod --replSet rs0 --bind_ip_all --port 27019 --dbpath "$BASE_PATH\27019\data";

mongosh --host $HOST <<\EOF
var config = {
    _id: "rs0",
    version: 1,
    members: [
        {
            _id: 1,
            host: "$HOST:27017",
            priority: 3
        },
        {
            _id: 2,
            host: "$HOST:27018",
            priority: 2
        },
        {
            _id: 3,
            host: "$HOST:27019",
            priority: 1
        }
    ]
}
rs.initiate(config);
exit;
EOF

MESSAGE="\n[MongoDB] ::: Replica set configuration is applied.\n";

printf "\033[32m$MESSAGE\033[0m";