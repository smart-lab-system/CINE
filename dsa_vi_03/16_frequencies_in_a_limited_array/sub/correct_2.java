

class Solution {
    // Function to count the frequency of all elements from 1 to N in the array.
    public List<Integer> frequencyCount(int[] arr) {
        // do modify in the given array
        HashMap<Integer,Integer> h=new HashMap<>();
        for(int i:arr){
            if(h.containsKey(i))
                h.put(i,h.get(i)+1);
            else
                h.put(i,1);
        }
        List<Integer> l=new ArrayList<>();
        for(int i=1;i<=arr.length;i++){
            if(h.containsKey(i))
                l.add(h.get(i));
            else
                l.add(0);
        }
        return l;
    }
}