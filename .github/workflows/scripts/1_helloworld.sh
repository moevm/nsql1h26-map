#!/bin/bash

dir="./hello_world/"
if [ -d "${dir}" ]; then 
  if [ "$(ls -A ${dir})" ]; then
    echo "::notice::Предварительная проверка пройдена - каталог ${dir} создан и не пуст"
    exit 0
  else
    echo "::error::Предварительная проверка не пройдена - каталог ${dir} пуст"
    exit 1
  fi
else 
  echo "::error::Предварительная проверка не пройдена - каталог не найден ${dir}"
  exit 1
fi