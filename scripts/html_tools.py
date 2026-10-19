"""公式店舗ページの限定された商品欄を解析する、外部依存のないHTMLツリー。"""
from html.parser import HTMLParser
import re


class Element:
    """要素の属性・子要素を保持し、サイト共通ナビを商品欄へ混入させない。"""
    def __init__(self, tag, attrs=()):
        self.tag = tag
        self.attrs = dict(attrs)
        self.children = []

    def has_class(self, name):
        return name in self.attrs.get("class", "").split()

    def all(self, tag=None, cls=None):
        result = []
        for child in self.children:
            if isinstance(child, Element):
                if (tag is None or child.tag == tag) and (cls is None or child.has_class(cls)):
                    result.append(child)
                result.extend(child.all(tag, cls))
        return result

    def text(self):
        if self.tag in ("script", "style", "noscript") or self.has_class("no-handling"):
            return ""
        return re.sub(r"\s+", " ", " ".join(child.text() if isinstance(child, Element) else child for child in self.children)).strip()


class Tree(HTMLParser):
    """HTMLの終了タグの省略にも最低限対応するツリー構築器。"""
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = Element("document")
        self.stack = [self.root]
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        node = Element(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1].children.append(Element(tag, attrs))

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                self.stack = self.stack[:index]
                break

    def handle_data(self, text):
        self.stack[-1].children.append(text)
