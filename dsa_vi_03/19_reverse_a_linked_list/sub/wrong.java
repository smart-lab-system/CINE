

// function Template for Java

/* linked list node class:

class Node {
    int data;
    Node next;
    Node(int value) {
        this.value = value;
    }
}

*/

class Solution {
    Node reverseList(Node head) {
        // code here
        Node pre=null, curr=head, next=null;
        while(curr!=null)
        {
            next=curr.next;
            curr.next=pre;
            curr=next;
        }
        return pre;
        
    }
}