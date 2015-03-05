MAKEFLAGS 			 += -j
SOURCE     				= $(shell find . -name '*.js' -or -name '*.glsl' -not -path './node_modules/**')
ENTRY_POINT				= main.js
BUILD			 				= ../_site/build.js
BUILD_GHPAGES			= ../build.js
BROWSERIFY_FLAGS 	= --debug

watch:
	watch $(MAKE) all

ghpages: $(BUILD_GHPAGES)
	@:

all: $(BUILD)
	@:

clean:
	rm $(BUILD) $(BUILD_GHPAGES)

# `npm install brfs` if this fails
$(BUILD): $(SOURCE) $(ENTRY_POINT)
	browserify -t aliasify -t brfs -e $(ENTRY_POINT) $(BROWSERIFY_FLAGS) -o $@
$(BUILD_GHPAGES): $(SOURCE) $(ENTRY_POINT)
	browserify -t aliasify -t brfs -e $(ENTRY_POINT) $(BROWSERIFY_FLAGS) -o $@

.PHONY: watch all clean ghpages
