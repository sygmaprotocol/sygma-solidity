FROM trufflesuite/ganache

WORKDIR /app
COPY data/ /app/data

CMD ["ganache", "--database.dbPath", "data/", "--server.host", "0.0.0.0", "--server.port", "8545"]
