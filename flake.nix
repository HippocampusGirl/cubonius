{
  description = "A basic flake with a shell";
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/release-24.05";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            awscli
            bun
            nodejs_22
            nixpkgs-fmt
            nodePackages.pnpm
            nodePackages.ts-node
            nodePackages.typescript
            nodePackages.typescript-language-server
          ];
          # See https://github.com/scottwillmoore/cloudflare-workers-with-nix
          shellHook = ''
            export SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
          '';
        };
      });
}
