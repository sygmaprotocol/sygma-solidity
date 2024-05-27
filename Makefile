URL?=http://localhost:8545

install-deps:
	@echo " > \033[32mInstalling dependencies... \033[0m "
	./scripts/install_deps.sh

.PHONY: test
test:
	@echo " > \033[32mTesting contracts... \033[0m "
	npx truffle test

compile:
	@echo " > \033[32mCompiling contracts... \033[0m "
	npx truffle compile

start-ganache:
	@echo " > \033[32mStarting ganache... \033[0m "
	./scripts/start_ganache.sh

start-forkedMainnet:
	@echo " > \033[32mStarting forked environment... \033[0m "
	ganache-cli -f $(FORKED_TESTS_PROVIDER) & sleep 3

start-geth:
	@echo " > \033[32mStarting geth... \033[0m "
	./scripts/geth/start_geth.sh

bindings: compile
	@echo " > \033[32mCreating go bindings for ethereum contracts... \033[0m "
	./scripts/create_bindings.sh

func-signatures:
	@echo " > \033[32mGenerating signature hashes... \033[0m "
	node -e "require('./scripts/generateFuncSignatures.js').generateAccessControlFuncSignatures()"

## license: Adds license header to missing files.
license:
	@echo "  >  \033[32mAdding license headers...\033[0m "
	GO111MODULE=off go get -u github.com/google/addlicense
	addlicense -c "Sygma" -f ./scripts/header.txt -y 2021 .

## license-check: Checks for missing license headers
license-check:
	@echo "  >  \033[Checking for license headers...\033[0m "
	GO111MODULE=off go get -u github.com/google/addlicense
	addlicense -check -c "SYgma" -f ./scripts/header.txt -y 2021 .
