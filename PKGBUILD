pkgname=python3-fildem
pkgver=2.0.1
pkgrel=1
pkgdesc="This project is a fork of gnomehud with the adition of a global menu bar"
arch=('i686' 'x86_64')
url="https://github.com/Weather-OS/Fildem-v2"
depends=('bamf'
         'appmenu-gtk-module'
         'libkeybinder3'
         'libdbusmenu-gtk2'
         'libdbusmenu-gtk3'
         'libdbusmenu-qt5')
makedepends=('git'
             'python-pip')
provides=("python3-fildem=$pkgver")
#source=('git+https://github.com/Weather-OS/Fildem-v2.git')
#md5sums=('SKIP')

pkgver() {
    cd "$srcdir/../"
    python3 -c "import fildem; print(fildem.__version__)"
}

prepare() {
    python3 -m pip install --user fuzzysearch
}

build() {
    cd "$srcdir/../"
    python3 setup.py bdist
}

check() {
    cd "$srcdir/../"
    python3 setup.py test
}

package() {
    cd "$srcdir/../"
    python3 setup.py install --skip-build --root=$pkgdir --optimize=1
}