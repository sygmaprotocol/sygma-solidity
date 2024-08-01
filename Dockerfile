FROM trufflesuite/ganache

WORKDIR /app
COPY data/ /app/data

CMD ["ganache", "--db", "data/", "-h", "0.0.0.0", "-p", "8545"]
