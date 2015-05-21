var easings = {
  no: function(t) { return 0; },
  linear: function(t) { return t; },
  quadratic: function(t) { return t * t; },
  cubic: function(t) { return t * t * t; },
  h01: function(t) {
    return t * t * (3 - 2 * t);
  }
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

var Timeline = function(obj) {
  this.obj = obj;
  this.keyframes = [];
}

Timeline.prototype.addKeyframe = function(time, kf, easing) {
  var kfs = this.keyframes;
  /*kfs.splice(locate(time, kfs, 0, kfs.length) + 1, 0, {
    time: time,
    values: kf,
    easing: easing || 'linear'
  });*/

  kfs.push({
    time: kfs.length > 0 ? kfs[this.count - 1].time + time : time,
    values: kf,
    easing: easing || 'linear'
  });

  this.count = kfs.length;
}

Timeline.prototype.update = function(time) {

  var i = locate(time, this.keyframes, 0, this.count),
      k0 = this.keyframes[i],
      k1 = this.keyframes[Math.min(i + 1, this.count - 1)],
      v0 = k0.values,
      v1 = k1.values;

  var ret = {};
  for(var i in v1) {
    var t = easings[k1.easing].call(null,
               Timeline.normalize(k0.time, k1.time, time)
             );
    ret[i] = v0[i] * (1 - t) + v1[i] * t;
  }

  return ret;

}

Timeline.normalize = function(t0, t1, t) {
  return Math.max(Math.min((t - t0) / (t1 - t0), 1), 0);
}



module.exports = Timeline;
