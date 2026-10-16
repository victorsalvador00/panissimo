# syntax=docker/dockerfile:1
#
# Targets:
#   runtime  (default, last stage) - the API.
#   migrator - EF Core migration bundle, run as an explicit step before starting a new version (B-17).

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Restore first so the layer is cached while only source files change.
COPY Directory.Build.props Sgo.sln dotnet-tools.json ./
COPY src/Sgo.Domain/Sgo.Domain.csproj src/Sgo.Domain/
COPY src/Sgo.Application/Sgo.Application.csproj src/Sgo.Application/
COPY src/Sgo.Infrastructure/Sgo.Infrastructure.csproj src/Sgo.Infrastructure/
COPY src/Sgo.Api/Sgo.Api.csproj src/Sgo.Api/
RUN dotnet restore src/Sgo.Api/Sgo.Api.csproj

COPY src/ src/
RUN dotnet publish src/Sgo.Api/Sgo.Api.csproj -c Release -o /app/publish --no-restore /p:UseAppHost=false

FROM build AS bundle
# TARGETARCH comes from BuildKit: amd64 (DigitalOcean) or arm64 (Oracle Ampere, Apple Silicon).
ARG TARGETARCH
RUN case "$TARGETARCH" in arm64) RID=linux-arm64 ;; *) RID=linux-x64 ;; esac \
 && dotnet tool restore \
 && dotnet ef migrations bundle \
      --project src/Sgo.Infrastructure/Sgo.Infrastructure.csproj \
      --startup-project src/Sgo.Api/Sgo.Api.csproj \
      --configuration Release --self-contained --target-runtime "$RID" \
      --output /app/efbundle

FROM mcr.microsoft.com/dotnet/runtime-deps:10.0 AS migrator
WORKDIR /app
COPY --from=bundle /app/efbundle .
USER $APP_UID
# The connection string comes from the same variable the API uses.
ENTRYPOINT ["/bin/sh", "-c", "exec /app/efbundle --connection \"$SGO__ConnectionStrings__Default\" \"$@\"", "efbundle"]

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
COPY --from=build /app/publish .
USER $APP_UID
ENTRYPOINT ["dotnet", "Sgo.Api.dll"]
