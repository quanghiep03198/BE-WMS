#!/bin/bash

mongosh <<\EOF
var config = {
    _id: "rs0",
    version: 1,
    members: [
        {
            _id: 1,
            host: "0.0.0.0:27017",
            priority: 3
        },
        {
            _id: 2,
            host: "0.0.0.0:27018",
            priority: 2
        },
        {
            _id: 3,
            host: "0.0.0.0:27019",
            priority: 1
        }
    ]
}
rs.initiate(config);
exit;
EOF

MESSAGE="\n[MongoDB] ::: Replica set configuration is applied.\n";

printf "\033[32m$MESSAGE\033[0m";