#!/usr/bin/env bash
# The Licensed Work is (c) 2022 Sygma
# SPDX-License-Identifier: LGPL-3.0-only


set -e

(set -x; yarn install --frozen-lockfil)

if [ -x "$(command -v truffle)" ]
then
  echo "truffle found, skipping install"
else
  (set -x; npm install --global truffle)
fi

if [ -x "$(command -v ganache)" ]
then
  echo "ganache found, skipping install"
else
  (set -x; npm install --global ganache)
fi

if [ -x "$(command -v abigen)" ]
then
  echo "abigen found, skipping install"
else
  unameOut="$(uname -s)"
  case "${unameOut}" in
      Linux*)
        echo "Found linux machine, will try using apt to install"
        ( set -x; sudo add-apt-repository -y ppa:ethereum/ethereum &&
        sudo apt-get update &&
        sudo apt-get install ethereum )
        ;;
      Darwin*)
        echo "Found macOS machine, will try using brew to install"
        ( set -x; brew tap ethereum/ethereum &&
        brew install ethereum )
        ;;
      *)
        echo "Operating system not supported, please manually install: https://geth.ethereum.org/docs/install-and-build/installing-geth"
  esac
fi
