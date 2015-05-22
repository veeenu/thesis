var easings = {
  no:     function(t) { return 0; },
  lin:    function(t) { return t; },
  in2:    function(t) { return t * t; },
  out2:   function(t) { var t1 = 1 - t; return 1 - t1 * t1; },
  in3:    function(t) { return t * t * t; },
  out3:   function(t) { var t1 = 1 - t; return 1 - t1 * t1 * t1; },
  h01:    function(t) { return t * t * (3 - 2 * t); }
};

var locate = function(time, arr, a, b) {
  var pivot = a + Math.floor((b - a) / 2);
  if(b - a <= 1 || arr[pivot].time === time)
    return pivot;
  if(arr[pivot].time < time) {
    return locate(time, arr, pivot, b);
  } else {
    return locate(time, arr, a, pivot);
  }
}

var normalize = function(t0, t1, t) {
  return Math.max(Math.min((t - t0) / (t1 - t0), 1), 0);
}

var PropTimeline = function() {
  this.keyframes = [];
}

PropTimeline.prototype.at = function(time, kf, easing) {
  var kfs = this.keyframes;

  kfs.push({
    //time: kfs.length > 0 ? kfs[this.count - 1].time + time : time,
    time: time,
    value: kf,
    easing: easing || 'linear'
  });

  this.count = kfs.length;

  return this;
}

PropTimeline.prototype.update = function(time) {

  var i = locate(time, this.keyframes, 0, this.count),
      k0 = this.keyframes[i],
      k1 = this.keyframes[Math.min(i + 1, this.count - 1)],
      v0 = k0.value,
      v1 = k1.value;

  var t = easings[k1.easing].call(null, normalize(k0.time, k1.time, time));

  return v0 * (1 - t) + v1 * t;

}

var Timeline = function() {
  this.properties = {};
}

Timeline.prototype.property = function(name) {
  if(!(name in this.properties))
    this.properties[name] = new PropTimeline();

  return this.properties[name];
}

Timeline.prototype.update = function(time) {
  var ret = {};
  for(var i in this.properties) {
    ret[i] = this.properties[i].update(time);
  }
  return ret;
}

module.exports = Timeline;
