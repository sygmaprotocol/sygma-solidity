FROM trufflesuite/ganache-cli

WORKDIR /app
COPY data/ /app/data

CMD ["ganache-cli", "--db", "data/", "-h", "0.0.0.0", "-p", "8545"]
