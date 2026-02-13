#!/bin/bash

build_docker_compose() {
    docker compose build --no-cache
}

run_docker_compose() {
    docker compose up -d
    sleep 30
}

check_web_client_root_page() {
    set -e
    
    dc_file=${1:-"./docker-compose.yml"}
    success_codes=0

    if [[ ! -f "${dc_file}" ]]; 
    then
        echo "::error:: Ошибка - нет файла docker-compose.yml"
        exit 1
    fi

    # Проход по всем сервисам.
    services_count=`yq '.services | length' ${dc_file}`
    for i in $(seq 0 $(( services_count - 1 )) );
    do
        service=`yq '.services | keys ['$i']' ${dc_file}`

        ports=`yq '.services.'$service'.ports' ${dc_file}`
        external_ports=`echo $ports | grep -o ':[0-9]\+:' | tr -d ':'`
        for ext_port in $external_ports;
        do 
            if [[ `curl -s -o /dev/null -w "%{http_code}" "127.0.0.1:${ext_port}"` -eq  200 ]];
            then
                success_codes=$((success_codes+1))
            fi
        done
    done
    if [[ ${success_codes} -eq 0 ]];
    then
        echo "::error:: Ошибка - обращение к корню (\) запущенного web-клиента вернуло ошибку."
        exit 1
    fi
}

check_tag() {
    TAG="1.0"
    if [ $(git tag -l "${TAG}") ]; then
        echo "::notice::Тег ${TAG} найден"
    else
        echo "::error::Тег ${TAG} не найден"
        exit 1
    fi
}

ACTION=${1:-"all"}

case $ACTION in
    "build")
        build_docker_compose
        ;;
    "run")
        run_docker_compose
        ;;
    "check-web")
        check_web_client_root_page
        ;;
    "check-tag")
        check_tag
        ;;
    # Для ручного запуска
    "all")
        build_docker_compose
        run_docker_compose
        check_web_client_root_page
        check_tag
        ;;
esac