MAKEFLAGS 			 += -j
SOURCE     				= $(shell find . -name '*.js' -not -path './node_modules/**')
ENTRY_POINT				= main.js
BUILD			 				= ../build.js
BROWSERIFY_FLAGS 	= --debug

watch:
	watch $(MAKE) all

all: $(BUILD)
	@:

clean:
	rm $(BUILD)

# `npm install brfs` if this fails
$(BUILD): $(SOURCE) $(ENTRY_POINT)
	browserify -t brfs -e $(ENTRY_POINT) $(BROWSERIFY_FLAGS) $(SOURCE) -o $@

.PHONY: watch all clean
