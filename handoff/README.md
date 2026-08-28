# Entrega local

Este paquete funciona sin un repositorio Git. Requiere Node.js y npm disponibles en `PATH`.

## Instalar, validar y compilar

Windows PowerShell:

```powershell
.\install-build.ps1
```

Linux:

```sh
sh ./install-build.sh
```

Ambos launchers ejecutan el mismo pipeline Node. El paquete incluye la suite `tests/` del árbol de entrada sin modificarla. El ensamblado falla si esa suite no existe y el pipeline falla si no encuentra archivos `*.test.ts` o `*.spec.ts`.

El pipeline informa las versiones de Node y npm, usa `npm ci` cuando hay un lock válido y `npm install` cuando no lo hay, ejecuta typecheck, tests y build, verifica `dist` y genera evidencia en `qa/`.

## Ejecutar la aplicación compilada

Windows PowerShell:

```powershell
.\run.ps1
```

Linux:

```sh
sh ./run.sh
```

El servidor usa `127.0.0.1:4173` por defecto y no instala dependencias ni recompila. Para cambiar el puerto:

```powershell
.\run.ps1 --port 8080
```

```sh
sh ./run.sh --port 8080
```

La carpeta `qa/` contiene metadata de build, árbol de dependencias, hashes SHA-256 y logs de instalación, typecheck, tests y build.
