
target "client" {
  context = "./client"
  platforms = [
    "linux/amd64",
    "linux/arm64"
  ]
}

target "core" {
  context = "./core"
  platforms = [
    "linux/amd64",
    "linux/arm64"
  ]
}
