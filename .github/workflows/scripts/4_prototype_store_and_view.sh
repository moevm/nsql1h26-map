#!/bin/bash

check_docker_compose() {
    set -e

    dc_file=${1:-"./docker-compose.yml"}

    if [[ ! -f "${dc_file}" ]]; then
        echo "::error:: Ошибка - нет файла docker-compose.yml"
        exit 1
    fi

    db_service=`yq '.services.db' ${dc_file}`
    if [[ "${db_service}" == "null" ]]; then
        echo "::error:: Ошибка - нет явно заданного сервиса для СУБД (с названием db)"
        exit 1
    fi
}

build_docker_compose() {
    docker compose build --no-cache
}

run_docker_compose() {
    docker compose up -d
}

check_tag() {
    TAG="0.5"
    if [ $(git tag -l "${TAG}") ]; then
        echo "::notice::Тег ${TAG} найден"
    else
        echo "::error::Тег ${TAG} не найден"
        exit 1
    fi
}

ACTION=${1:-"all"}

case $ACTION in
    "check-compose")
        check_docker_compose
        ;;
    "build")
        build_docker_compose
        ;;
    "run")
        run_docker_compose
        ;;
    "check-tag")
        check_tag
        ;;
    # Для ручного запуска
    "all")
        check_docker_compose
        build_docker_compose
        run_docker_compose
        check_tag
        ;;
esac